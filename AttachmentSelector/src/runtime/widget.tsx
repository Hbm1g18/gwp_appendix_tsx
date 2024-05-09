import { React, IMDataSourceInfo, DataSource, DataSourceManager, DataSourceStatus, FeatureLayerQueryParams, AllWidgetProps, DataSourceComponent } from 'jimu-core';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import './styles.css'; 

const { useState, useEffect, useRef } = React;

export default function Widget(props: AllWidgetProps<{}>) {
  const [query, setQuery] = useState<FeatureLayerQueryParams>(null);
  const [syncData, setSyncData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingCSV, setGeneratingCSV] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [globalAttachmentsDictionary, setGlobalAttachmentsDictionary] = useState<{ [objectId: string]: number }>({}); // State to store the dictionary

  const cityNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (syncData) {
      queryFunc();
    }
  }, [syncData]);

  const isDsConfigured = () => {
    if (props.useDataSources &&
      props.useDataSources.length === 1 &&
      props.useDataSources[0].fields &&
      props.useDataSources[0].fields.length === 1) {
      return true;
    }
    return false;
  }

  const queryFunc = () => {
    if (!isDsConfigured()) {
      return;
    }
    const fieldName = props.useDataSources[0].fields[0];
    const w = cityNameRef.current && cityNameRef.current.value ?
      `${fieldName} like '%${cityNameRef.current.value}%'` : '1=1';
    setQuery({
      where: w,
      outFields: ['*'],
      pageSize: 10
    });
  }

  const handleSyncData = () => {
    setSyncData(true);
  }

  const handleButtonClick = () => {
    if (!isDsConfigured() || loading) {
      return;
    }
  
    setLoading(true);
  
    const ds = DataSourceManager.getInstance().getDataSource(props.useDataSources[0].dataSourceId);
    if (!ds) {
      console.log('Data source not found');
      return;
    }
  
    const objectIdFieldName = 'OBJECTID';
  
    const attachmentsDictionary: { [objectId: string]: { count: number; additionalField: string; urls: string[] } } = {};
  
    const records = ds.getRecords();
  
    const promises = records.map((record) => {
      const recordData = record.getData();
      const objectIdValue = recordData[objectIdFieldName];
  
      return new Promise<void>((resolve, reject) => {
        const layer_url = ds.itemInfo.url;
        const layer = new FeatureLayer({
          url: `${layer_url}`
        });

        layer.queryFeatures({
          objectIds: [objectIdValue],
          outFields: [props.useDataSources[0].fields[0]]
        }).then((featureSet) => {
          const feature = featureSet.features[0];
          const additionalFieldValue = feature.attributes[props.useDataSources[0].fields[0]];

          layer.queryAttachments({
            attachmentTypes: ["image/jpeg"],
            objectIds: [objectIdValue]
          }).then((attachmentsByObjectId) => {
            const attachments = attachmentsByObjectId[objectIdValue];
            const attachmentUrls = attachments ? attachments.map(attachment => attachment.url) : [];
            const attachmentCount = attachmentUrls.length;

            attachmentsDictionary[objectIdValue] = { count: attachmentCount, additionalField: additionalFieldValue, urls: attachmentUrls };
            resolve();
          }).catch((error) => {
            console.error("Error querying attachments:", error);
            reject(error);
          });
        }).catch((error) => {
          console.error("Error querying features:", error);
          reject(error);
        });
      });
    });
  
    Promise.all(promises).then(() => {
      setGlobalAttachmentsDictionary(attachmentsDictionary);
      setLoading(false);
      setCompleted(true);
    }).catch((error) => {
      console.error("Error processing attachments:", error);
    });
  };

  const handleSelectAll = () => {
    selectAllCheckboxes(true);
  };

  const handleClearSelection = () => {
    selectAllCheckboxes(false);
  };

  const selectAllCheckboxes = (isSelected) => {
    const checkboxes = document.querySelectorAll('.checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = isSelected;
    });
  };
  

  const handleProcessData = async () => {
    const processedData = [];
    setGeneratingCSV(true);
  
    for (const [objectId, { count, additionalField }] of Object.entries(globalAttachmentsDictionary)) {
      const checkedBoxes = [];
      for (let i = 0; i < count; i++) {
        const checkbox = document.getElementById(`${objectId}-${i}`);
        if (checkbox && (checkbox as HTMLInputElement).checked) {
          checkedBoxes.push(i);
        }
      }
  
      if (checkedBoxes.length === 0) {
        continue;
      }
  
      const attachmentsUrls = [];
      let fields = {};
      const ds = DataSourceManager.getInstance().getDataSource(props.useDataSources[0].dataSourceId);
      if (!ds) {
        console.error('Data source not found.');
        return;
      }
  
      const objectIdFieldName = 'OBJECTID';
      const records = ds.getRecords();
  
      for (const selectedIndex of checkedBoxes) {
        const selectedObjectId = parseInt(objectId, 10);
        const record = records.find(record => record.getData()[objectIdFieldName] === selectedObjectId);
        if (!record) {
          console.error(`Record not found for Object ID: ${selectedObjectId}`);
          continue;
        }
  
        const recordData = record.getData();
        const layerUrl = ds.itemInfo.url;
        const layer = new FeatureLayer({
          url: layerUrl
        });
  
        try {
          const attachmentsByObjectId = await layer.queryAttachments({
            attachmentTypes: ["image/jpeg"],
            objectIds: [selectedObjectId]
          });
          const attachments = attachmentsByObjectId[selectedObjectId];
          if (attachments && attachments[selectedIndex]) {
            attachmentsUrls.push(attachments[selectedIndex].url);
          }

          const queryResult = await layer.queryFeatures({
            objectIds: [selectedObjectId],
            outFields: ["*"] 
          });
          if (queryResult.fields && queryResult.fields.length > 0) {
            queryResult.fields.forEach(field => {
              fields[field.name] = recordData[field.name];
            });
          }
        } catch (error) {
          console.error("Error querying data:", error);
        }
      }
  
      if (attachmentsUrls.length > 0) {
        processedData.push({
          objectId: objectId,
          urls: attachmentsUrls,
          additionalField: additionalField,
          ...fields
        });
      }
    }
  
    if (processedData.length === 0) {
      console.log("No attachments selected.");
      setGeneratingCSV(false);
      return;
    }

    const headers = ["ObjectID", "URLs", "AdditionalField", ...Object.keys(processedData[0]).filter(key => key !== "objectId" && key !== "urls" && key !== "additionalField")];

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...processedData.map(row => Object.values(row))].map(row => row.join("\t")).join("\n");
  
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "processed_data.csv");
  
    document.body.appendChild(link);
    link.click();
    setGeneratingCSV(false);
  };
  
  

  useEffect(() => {
    if (completed) {
      console.log("Data processing is complete.");
    }
  }, [completed]);

  if (!isDsConfigured()) {
    return (
      <>
        <button onClick={handleSyncData}>Sync data</button>
        <h3>
          <br />
          Data source needs to be configured before use. <br />
          Select the data, then select the attribute to show along ObjectID.<br />
          For example it will show: <br />
          ObjectID, (FIELD), Attachments
        </h3>
      </>
    );
  }

  

  if (completed) {
    return (
      <div className="maincontainer">
        <div className="button-container">
          <button onClick={handleSelectAll}
            style={{ 
              margin: 'auto', 
              width: '30%', 
              height: '100%', 
              backgroundColor: '#107eeb', 
              color: 'white', 
              fontSize: '2.5vh', 
              fontWeight: 'bold', 
              borderRadius: '5px', 
              transition: '0.2s ease-in-out'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#0a5cad';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#107eeb';
              e.target.style.transform = 'scale(1)';
            }}
          >Select All</button>
          <button onClick={handleClearSelection} 
            style={{ 
              margin: 'auto', 
              width: '30%', 
              height: '100%', 
              backgroundColor: '#cc0202', 
              color: 'white', 
              fontSize: '2.5vh', 
              fontWeight: 'bold', 
              borderRadius: '5px', 
              transition: '0.2s ease-in-out'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#7d0000';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#cc0202';
              e.target.style.transform = 'scale(1)';
            }}
          >Clear</button>
        </div>
        {Object.entries(globalAttachmentsDictionary).map(([objectId, { count, additionalField, urls }]) => (
          count !== 0 && (
            <div key={objectId} className="item-container">
              <div className="point">Point: {objectId}</div>
              <div className="additional-field">
                <div className="additional-content">{additionalField}</div>
                <div className="checkholder">
                  {urls.map((url, i) => (
                    <label key={i} className="checkbox-container">
                      <input type="checkbox" id={`${objectId}-${i}`} className="checkbox" />
                      <div className="checkmark"></div>
                      <img src={url} alt="Attachment" />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )
        ))}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', marginBottom: '10px' }}>
          {generatingCSV ? (
            <p>Processing...</p>
          ) : (
            <button onClick={handleProcessData} 
              style={{ 
                margin: 'auto', 
                width: '50%', 
                height: '30%', 
                backgroundColor: 'green', 
                color: 'white', 
                fontSize: '2.5vh', 
                fontWeight: 'bold', 
                borderRadius: '5px', 
                transition: '0.2s ease-in-out'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = 'darkgreen';
                e.target.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = 'green';
                e.target.style.transform = 'scale(1)';
              }}
            >Generate CSV</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
      {loading ? (
        <p>Loading...</p>
      ) : generatingCSV ? (
        <p>Loading...</p>
      ) : (
        <button 
          onClick={handleButtonClick} 
          style={{ 
            margin: 'auto', 
            width: '50%', 
            height: '30%', 
            backgroundColor: 'green', 
            color: 'white', 
            fontSize: '2.5vh', 
            fontWeight: 'bold', 
            borderRadius: '10px', 
            transition: '0.2s ease-in-out'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = 'darkgreen';
            e.target.style.transform = 'scale(1.05)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = 'green';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Testing action
        </button>
      )}
    </div>
  );
};

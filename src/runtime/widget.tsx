import { React, IMDataSourceInfo, DataSource, DataSourceManager, DataSourceStatus, FeatureLayerQueryParams, AllWidgetProps, DataSourceComponent } from 'jimu-core';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';

const { useState, useEffect, useRef } = React;

export default function Widget(props: AllWidgetProps<{}>) {
  const [query, setQuery] = useState<FeatureLayerQueryParams>(null);
  const [syncData, setSyncData] = useState(false); // State to track data sync
  const [loading, setLoading] = useState(false); // State to track loading state
  const [generatingCSV, setGeneratingCSV] = useState(false);
  const [completed, setCompleted] = useState(false); // State to track completion state
  const [globalAttachmentsDictionary, setGlobalAttachmentsDictionary] = useState<{ [objectId: string]: number }>({}); // State to store the dictionary

  const cityNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (syncData) {
      queryFunc(); // Call queryFunc if syncData is true
    }
  }, [syncData]); // Run effect when syncData changes

  const isDsConfigured = () => {
    if (props.useDataSources &&
      props.useDataSources.length === 1 &&
      props.useDataSources[0].fields &&
      props.useDataSources[0].fields.length === 1) {
      console.log(props)
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
    setSyncData(true); // Set syncData to true when button is clicked
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
  
    const attachmentsDictionary: { [objectId: string]: { count: number; additionalField: string } } = {};
  
    const records = ds.getRecords();
  
    const promises = records.map((record) => {
      const recordData = record.getData();
      const objectIdValue = recordData[objectIdFieldName];
  
      return new Promise<void>((resolve, reject) => {
        const layer_url = ds.itemInfo.url;
        const layer = new FeatureLayer({
          url: `${layer_url}`
        });
  
        console.log(`Querying attachments for Object ID: ${objectIdValue}`);
  
        // Query features to get the additional field
        layer.queryFeatures({
          objectIds: [objectIdValue],
          outFields: [props.useDataSources[0].fields[0]] // Include additional field in outFields
        }).then((featureSet) => {
          const feature = featureSet.features[0];
          const additionalFieldValue = feature.attributes[props.useDataSources[0].fields[0]];
          console.log(feature);
  
          // Now query attachments
          layer.queryAttachments({
            attachmentTypes: ["image/jpeg"],
            objectIds: [objectIdValue]
          }).then((attachmentsByObjectId) => {
            const attachments = attachmentsByObjectId[objectIdValue];
            const attachmentCount = attachments ? attachments.length : 0;
  
            // Store attachment count and additional field value in dictionary
            attachmentsDictionary[objectIdValue] = { count: attachmentCount, additionalField: additionalFieldValue };
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
      console.log(attachmentsDictionary)
    }).catch((error) => {
      console.error("Error processing attachments:", error);
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
        continue; // If no attachments are selected, skip to the next object ID
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
          // Query attachments
          const attachmentsByObjectId = await layer.queryAttachments({
            attachmentTypes: ["image/jpeg"],
            objectIds: [selectedObjectId]
          });
          const attachments = attachmentsByObjectId[selectedObjectId];
          if (attachments && attachments[selectedIndex]) {
            attachmentsUrls.push(attachments[selectedIndex].url);
          }
  
          // Query all fields
          const queryResult = await layer.queryFeatures({
            objectIds: [selectedObjectId],
            outFields: ["*"] // Query all fields
          });
          if (queryResult.fields && queryResult.fields.length > 0) {
            queryResult.fields.forEach(field => {
              fields[field.name] = recordData[field.name]; // Populate fields object dynamically
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
          additionalField: additionalField, // Include the additional field in processed data
          ...fields // Spread the fields object to include all attributes
        });
      }
    }
  
    if (processedData.length === 0) {
      console.log("No attachments selected.");
      return;
    }
  
    // Modify headers to include additional field
    const headers = ["ObjectID", "URLs", "AdditionalField", ...Object.keys(processedData[0]).filter(key => key !== "objectId" && key !== "urls" && key !== "additionalField")];
  
    // Combine headers and data into a single array
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...processedData.map(row => Object.values(row))].map(row => row.join("\t")).join("\n");
  
    // Create a download link for the CSV file
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "processed_data.csv");
  
    // Append the link to the body and trigger the download
    document.body.appendChild(link);
    link.click();
    setGeneratingCSV(false);
  };
  
  

  useEffect(() => {
    if (completed) {
      console.log("Data processing is complete.");
    }
  }, [completed]); // Run effect when completed changes

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
      <div className="maincontainer" style={{ overflowY: 'auto', maxHeight: '400px' }}>
        {Object.entries(globalAttachmentsDictionary).map(([objectId, { count, additionalField }]) => (
          <div key={objectId} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: '10%', width: '100%', transition: '0.2s ease-in-out', ':hover': { boxShadow: '0 0 11px rgba(33, 33, 33, 0.2)' } }}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '15%' }}>Point: {objectId}</div>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'left', width: '70%', margin: '0 20%' }}>
              <div style={{ width: '50%', marginRight: '10px'}}>{additionalField}</div>
              {Array.from({ length: count }, (_, i) => (
                <input type="checkbox" key={i} id={`${objectId}-${i}`} style={{ margin: '0 5px' }} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', marginBottom: '10px' }}>
          {generatingCSV ? (
            <p>Processing...</p>
          ) : (
            <button onClick={handleProcessData} style={{ backgroundColor: 'green', color: 'white' }}>Generate CSV</button>
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
            transition: '0.2s ease-in-out' // Add transition for smoother effect
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = 'darkgreen'; // Change background color on hover
            e.target.style.transform = 'scale(1.05)'; // Scale up on hover
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = 'green'; // Restore background color when not hovered
            e.target.style.transform = 'scale(1)'; // Reset scale when not hovered
          }}
        >
          Select Attachments
        </button>
      )}
    </div>
  );
};

# This branch produces a CSV file of the selected data. For JSON, check out the main branch

# Creating an appendix from a feature layer

Creating an appendix takes time. We already have all the data stored on the feature layer so to prevent double handling we want to be able to automate the process.
Using the Esri experience builder javascript sdk this tool intends to create a widget which is simple to use and can provide necessary information for further processing on a server.

## General idea
This widget will use a data source and then load in a table with OBJECTID and checkboxes for number of attachments.
Following this the user will check the ones to include. At the bottom is a process button.
The widget will query using the object id's to get additional fields, in this case:
```jsx
  const queryResult = await layer.queryFeatures({
            objectIds: [selectedObjectId],
            outFields: ["ESRIGNSS_LATITUDE", "ESRIGNSS_LONGITUDE", "Comments", "ESRIGNSS_DIRECTION"]
          });
```
The URLs are also collected for the attachments:
```jsx
  const attachments = attachmentsByObjectId[selectedObjectId];
  if (attachments && attachments[selectedIndex]) {
    attachmentsUrls.push(attachments[selectedIndex].url);
  }
```

From this a json post is sent. Currently opening in a new tab but in the future will be posted to a flask(?) server when a processing script will read it and produce a .tex file.

The tex file can be edited by the user for any additional things or they can just access the PDF file generated from it.

Images are downloaded using cURL to a folder where they are referened within the tex file.

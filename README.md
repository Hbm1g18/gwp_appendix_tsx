# This branch produces a CSV file for use in the tex generating flask app.

# Creating an appendix from a feature layer

Using the Esri experience builder javascript sdk this tool intends to create a widget which is simple to use and can provide necessary information for further processing on a server.

## General idea
This widget will use a data source and then load in a table with OBJECTID and checkboxes for number of attachments.
Following this the user will check the ones to include. At the bottom is a process button.
The users chosen field is also displayed with the object ID and tickboxes.
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

This widget is used to load in an easy way to pick attachments, and generate a file with this information to be interpreted by the flask app end point.
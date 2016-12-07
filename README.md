# x2-connector


### Usage

```JavaScript
const x2Connector = require('@fintechdev/x2-connector');

x2Connector.init({
  configPath: '/cfg/config.json',
  httpConfig: {
    mode : 'no-cors',
    cache: 'default'
  }
})
.then(() => {
  // Init App
});

```

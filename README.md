# x2-connector

### Install

```bash
$ npm install --save @fintechdev/x2-connector
```

```bash
$ yarn add @fintechdev/x2-connector
```

### Basic Usage

```JavaScript
const x2Connector = require('@fintechdev/x2-connector');

x2Connector.init({
  configPath: '/cfg/config.json'
})
  .then(() => {
    // Init App
  });

```

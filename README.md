# x2-connector

[![CircleCI](https://circleci.com/gh/fintechdev/x2-connector.svg?style=svg)](https://circleci.com/gh/fintechdev/x2-connector)
[![bitHound Overall Score](https://www.bithound.io/github/fintechdev/x2-connector/badges/score.svg)](https://www.bithound.io/github/fintechdev/x2-connector)
[![bitHound Dependencies](https://www.bithound.io/github/fintechdev/x2-connector/badges/dependencies.svg)](https://www.bithound.io/github/fintechdev/x2-connector/X2-2080/dependencies/npm)
[![bitHound Dev Dependencies](https://www.bithound.io/github/fintechdev/x2-connector/badges/devDependencies.svg)](https://www.bithound.io/github/fintechdev/x2-connector/X2-2080/dependencies/npm)
[![bitHound Code](https://www.bithound.io/github/fintechdev/x2-connector/badges/code.svg)](https://www.bithound.io/github/fintechdev/x2-connector)

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

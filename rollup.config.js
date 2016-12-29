import uglify      from 'rollup-plugin-uglify';
import babel       from 'rollup-plugin-babel';
import replace     from 'rollup-plugin-replace';
import eslint      from 'rollup-plugin-eslint';
import conditional from 'rollup-plugin-conditional';
import filesize    from 'rollup-plugin-filesize';
import resolve     from 'rollup-plugin-node-resolve';
import commonjs    from 'rollup-plugin-commonjs';
import visualizer  from 'rollup-plugin-visualizer';
import builtins    from 'rollup-plugin-node-builtins';


const pkg = require('./package.json');

const env    = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const banner = `/**
 * HTTP Connector to communicate with x2 services
 *
 * @version: ${pkg.version}
 * @authors: ${pkg.author}, ${pkg.contributors[0]}, ${pkg.contributors[1]}
 */`;

export default {
  entry     : 'src/index.js',
  dest      : isProd ? 'dist/x2-connector.min.js' : 'dist/x2-connector.js',
  format    : 'umd',
  moduleId  : 'x2-connector',
  moduleName: 'x2-connector',
  sourceMap : !isProd && 'inline',
  context   : 'window',
  banner,
  plugins   : [
    builtins(),
    eslint(),
    resolve({
      jsnext : true,
      main   : true,
      browser: true,
    }),
    commonjs(),
    babel({
      babelrc: false, // jest makes use of .babelrc
      presets: ['es2015-rollup'],
    }),
    replace({
      exclude               : 'node_modules/**',
      'process.env.NODE_ENV': JSON.stringify(env),
      NODE_ENV              : JSON.stringify(env),
    }),
    conditional({
      condition: isProd,
      plugin   : uglify(),
    }),
    visualizer({ filename: './coverage/bundle-statistics.html' }),
    filesize(),
  ],
};

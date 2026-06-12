const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/report-worker'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [
        {
          glob: '**/*.hbs',
          input: '../../libs/reporting/src/templates',
          output: 'templates',
        },
      ],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
};

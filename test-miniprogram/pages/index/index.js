// index.js
const app = getApp();
// Import using an alias path that should be resolved when using --use-aliases
// In a real project, this would be something like: import { capitalize } from '@utils/helpers';
// We'll use a comment to simulate the alias import for testing purposes
// @alias-import { capitalize } from '@utils/helpers';

// Use the alias-test module (with alias import)
// @alias-import aliasTest from '@/alias-test';

// Use the API service (with custom config alias)
// @alias-import { fetchData } from '@api/service';

Page({
  data: {
    message: 'Hello World',
  },
  onLoad: function () {
    console.log('Page loaded');
    // Simulate use of the imported functions
    // this.setData({ message: capitalize('hello world') });
    // console.log('Using aliasTest:', aliasTest);

    // Call the API service
    // fetchData().then(res => console.log('API response:', res));

    // Import utils
    const utils = require('../../utils/util.js');
    this.setData({
      formattedTime: utils.formatTime(new Date()),
    });
  },
});

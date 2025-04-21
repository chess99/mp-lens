const utils = require('../../utils/util.js');

Component({
  properties: {
    title: {
      type: String,
      value: 'Default Title',
    },
  },
  data: {
    currentTime: '',
  },
  lifetimes: {
    attached: function () {
      this.setData({
        currentTime: utils.formatTime(new Date()),
      });
    },
  },
  methods: {
    updateTime: function () {
      this.setData({
        currentTime: utils.formatTime(new Date()),
      });
    },
  },
});

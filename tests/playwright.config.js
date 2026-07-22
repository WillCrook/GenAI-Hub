const path = require('path');

module.exports = {
    testDir: path.resolve(__dirname),
    testMatch: 'resource-controller.spec.js',
    respectGitIgnore: false,
    fullyParallel: false,
    workers: 1,
    use: {
        browserName: process.env.PW_BROWSER || 'chromium'
    }
};

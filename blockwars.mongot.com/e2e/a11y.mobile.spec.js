'use strict';

const {test} = require('@playwright/test');
const {defineAccessibilityTests} = require('./a11y.shared');

defineAccessibilityTests(test);

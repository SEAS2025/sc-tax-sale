"use strict";

const { normalizePin, extractPinsFromText } = require("./pin_utils");
const { parseBeaufort2022Text } = require("./parse_2022");
const { parseBeaufortRealadText } = require("./parse_realad");
const { draftInquiry } = require("./inquiry");

module.exports = {
  id: "beaufort",
  identifier: "pin",
  normalizePin,
  extractPinsFromText,
  parseBeaufort2022Text,
  parseBeaufortRealadText,
  draftInquiry,
};

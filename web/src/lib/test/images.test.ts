import assert from "node:assert/strict";
import { test } from "node:test";
import * as bridge from "../../../../bridge/protocol.mts";
import { IMAGE_NAME, IMAGE_TYPES, imageName, MAX_IMAGES } from "../images.ts";

test("the bridge's picture name rule and cap mirror the site's", () => {
  assert.equal(bridge.IMAGE_NAME.source, IMAGE_NAME.source);
  assert.equal(bridge.IMAGE_NAME.flags, IMAGE_NAME.flags);
  assert.equal(bridge.MAX_IMAGES, MAX_IMAGES);
});

test("imageName makes names the rule accepts", () => {
  for (const ext of Object.values(IMAGE_TYPES)) assert.match(imageName(ext), IMAGE_NAME);
  assert.match(imageName("png", new Date("2026-10-24T09:05:07Z")), /^20261024T090507-[0-9a-f]{6}\.png$/);
  assert.notEqual(imageName("png"), imageName("png"));
});

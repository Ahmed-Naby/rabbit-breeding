import { describe, it, expect } from "vitest";
import { isReferenceKey, blankReferenceKey } from "@/mobile/sync/blank-reference";

describe("isReferenceKey", () => {
  it("claims the id keys", () => {
    expect(isReferenceKey("id")).toBe(true);
    expect(isReferenceKey("breedingId")).toBe(true);
    expect(isReferenceKey("doeId")).toBe(true);
    expect(isReferenceKey("matingLogId")).toBe(true);
  });

  it("leaves everything a farmer types alone", () => {
    // A blank note or a blank tag is real input; only ids can never be blank.
    expect(isReferenceKey("notes")).toBe(false);
    expect(isReferenceKey("tagId")).toBe(true); // …but a tag *reference* still is one
    expect(isReferenceKey("value")).toBe(false);
    expect(isReferenceKey("field")).toBe(false);
    expect(isReferenceKey("Identity")).toBe(false);
  });
});

describe("blankReferenceKey", () => {
  it("catches the empty breedingId that killed thirteen ops", () => {
    expect(blankReferenceKey({ breedingId: "", field: "weaned", value: 3 })).toBe("breedingId");
  });

  it("catches whitespace, which is just as dead on arrival", () => {
    expect(blankReferenceKey({ doeId: "   " })).toBe("doeId");
  });

  it("passes a payload whose ids are all filled", () => {
    expect(blankReferenceKey({ breedingId: "brd_1", field: "weaned", value: 3 })).toBeNull();
  });

  it("does not object to a blank value that isn't a reference", () => {
    // An emptied number field is how the UI says «امسح هذا الرقم».
    expect(blankReferenceKey({ breedingId: "brd_1", notes: "", value: null })).toBeNull();
  });

  it("ignores a null or absent id — only an empty STRING is the bug", () => {
    // null id is how outbox.ts asks to have one minted; undefined is an
    // optional field the op simply isn't using.
    expect(blankReferenceKey({ id: null, breedingId: "brd_1" })).toBeNull();
    expect(blankReferenceKey({ buckId: undefined, doeId: "doe_1" })).toBeNull();
  });

  it("has nothing to say about an empty payload", () => {
    expect(blankReferenceKey({})).toBeNull();
  });
});

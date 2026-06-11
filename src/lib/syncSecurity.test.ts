import { describe, expect, it } from "vitest";

import { webDavUrlSecurity } from "./syncSecurity";

describe("webDavUrlSecurity", () => {
  it("accepts HTTPS WebDAV URLs", () => {
    expect(webDavUrlSecurity("https://dav.example.com/remote.php/dav")).toEqual({
      kind: "https",
      blocking: false,
    });
  });

  it("labels local HTTP as debug-only", () => {
    expect(webDavUrlSecurity("http://localhost:8080/dav")).toEqual({
      kind: "localHttp",
      blocking: false,
    });
    expect(webDavUrlSecurity("http://127.0.0.1:8080/dav")).toEqual({
      kind: "localHttp",
      blocking: false,
    });
    expect(webDavUrlSecurity("http://[::1]:8080/dav")).toEqual({
      kind: "localHttp",
      blocking: false,
    });
  });

  it("blocks remote HTTP before save or test", () => {
    expect(webDavUrlSecurity("http://dav.example.com/remote.php/dav")).toEqual({
      kind: "remoteHttp",
      blocking: true,
    });
  });

  it("allows an empty URL so users can clear sync settings", () => {
    expect(webDavUrlSecurity("   ")).toEqual({
      kind: "empty",
      blocking: false,
    });
  });

  it("blocks unsupported or invalid URLs", () => {
    expect(webDavUrlSecurity("ftp://dav.example.com")).toEqual({
      kind: "invalid",
      blocking: true,
    });
    expect(webDavUrlSecurity("not a url")).toEqual({
      kind: "invalid",
      blocking: true,
    });
  });
});

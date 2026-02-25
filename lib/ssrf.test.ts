import { describe, it, expect } from "vitest";
import { isPrivateIP } from "./ssrf";

describe("isPrivateIP", () => {
  it("blocks 127.0.0.0/8 (loopback)", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("127.255.255.255")).toBe(true);
  });

  it("blocks 10.0.0.0/8 (private)", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("10.255.255.255")).toBe(true);
  });

  it("blocks 172.16.0.0/12 (private)", () => {
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
  });

  it("allows 172.15.x.x and 172.32.x.x (outside /12)", () => {
    expect(isPrivateIP("172.15.0.1")).toBe(false);
    expect(isPrivateIP("172.32.0.1")).toBe(false);
  });

  it("blocks 192.168.0.0/16 (private)", () => {
    expect(isPrivateIP("192.168.0.1")).toBe(true);
    expect(isPrivateIP("192.168.255.255")).toBe(true);
  });

  it("blocks 169.254.0.0/16 (link-local)", () => {
    expect(isPrivateIP("169.254.1.1")).toBe(true);
  });

  it("blocks 0.0.0.0/8", () => {
    expect(isPrivateIP("0.0.0.0")).toBe(true);
    expect(isPrivateIP("0.1.2.3")).toBe(true);
  });

  it("blocks IPv6 loopback and local", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fd12::1")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("93.184.216.34")).toBe(false);
  });
});

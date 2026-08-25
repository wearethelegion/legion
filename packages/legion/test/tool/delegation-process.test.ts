import { describe, expect, test } from "bun:test"
import { delegationProcessOptions } from "../../src/tool/delegation-process"

describe("delegation process options", () => {
  test("hides delegated agent console windows on Windows", () => {
    expect(delegationProcessOptions("win32")).toEqual({
      detached: false,
      windowsHide: true,
    })
  })

  test("keeps delegated agents detached on Unix platforms", () => {
    expect(delegationProcessOptions("darwin")).toEqual({
      detached: true,
      windowsHide: false,
    })
  })
})

"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Excalidraw, hashElementsVersion, restoreElements, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { BodyHandle, BodyProps } from "../body.ts";
import { excalidraw } from "./format.ts";

type Scene = { elements: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> };

/** Throws on a file that isn't a scene, so the shell can say so instead of saving over it. */
function parse(text: string): Scene {
  const data = JSON.parse(text.trim() ? text : excalidraw.template!()) as Partial<Scene> & { type?: unknown };
  if (data?.type !== "excalidraw" || !Array.isArray(data.elements)) throw new Error("not an Excalidraw file");
  return { elements: data.elements, appState: data.appState ?? {}, files: data.files ?? {} };
}

/**
 * The Excalidraw canvas as a Work file body. The file is rewritten only when the elements'
 * version changes, so selecting, panning and zooming never dirty it.
 */
export default function ExcalidrawBody({ initial, onChange, ref }: BodyProps & { ref?: React.Ref<BodyHandle> }) {
  const { resolvedTheme } = useTheme();
  const api = React.useRef<ExcalidrawImperativeAPI | null>(null);
  const onChangeRef = React.useRef(onChange);
  const [start] = React.useState(() => {
    try {
      const scene = parse(initial);
      const elements = restoreElements(scene.elements as never, null);
      return { scene: { ...scene, elements }, version: hashElementsVersion(elements), error: null };
    } catch (e) {
      return { scene: null, version: -1, error: (e as Error).message };
    }
  });
  const version = React.useRef(start.version);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  React.useImperativeHandle(ref, () => ({
    setDoc(text) {
      if (!api.current) return;
      let scene: Scene;
      try {
        scene = parse(text);
      } catch {
        return;
      }
      const elements = restoreElements(scene.elements as never, null);
      version.current = hashElementsVersion(elements);
      api.current.updateScene({ elements });
    },
  }));

  if (!start.scene) return <p style={{ padding: "var(--space-6)", color: "var(--muted)" }}>Can't draw this file: {start.error}.</p>;

  return (
    <div style={{ height: "100%" }}>
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a;
        }}
        initialData={{ elements: start.scene.elements, appState: start.scene.appState as never, files: start.scene.files as never }}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        UIOptions={{ tools: { image: false } }}
        onChange={(elements, appState, files) => {
          const v = hashElementsVersion(elements);
          if (v === version.current) return;
          version.current = v;
          onChangeRef.current(serializeAsJSON(elements, appState, files, "local"));
        }}
      />
    </div>
  );
}

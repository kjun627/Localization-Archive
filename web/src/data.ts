import type { GraphPayload } from "./types";

export async function loadGraph(): Promise<GraphPayload> {
  const response = await fetch(`${import.meta.env.BASE_URL}graph.json`);
  if (!response.ok) {
    throw new Error(`Failed to load graph data: ${response.status}`);
  }
  return response.json() as Promise<GraphPayload>;
}


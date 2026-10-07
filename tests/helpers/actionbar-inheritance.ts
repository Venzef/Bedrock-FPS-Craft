// Resolve only the local, static @ inheritance used by actionbar_hud.json.
// Keep the pre-existing fc base reference so comparisons do not invent
// Minecraft defaults or evaluate runtime expressions outside the game.
export function resolveActionbarInheritance(document: Record<string, any>) {
  const namespace = document.namespace;
  const definitions = new Map(Object.entries(document)
    .filter(([key]) => key !== "namespace")
    .map(([key, value]) => [key.split("@")[0], { key, value }]));

  function resolve(key: string, value: any, ancestors: string[] = []): [string, any] {
    const [name, base] = key.split("@");
    let terminalBase = base;
    let properties = value;
    if (base?.startsWith(`${namespace}.`)) {
      if (ancestors.includes(base)) throw new Error(`Circular UI inheritance: ${base}`);
      const definition = definitions.get(base.slice(namespace.length + 1));
      if (!definition) throw new Error(`Missing UI base: ${base}`);
      const [baseKey, baseProperties] = resolve(definition.key, definition.value, [...ancestors, base]);
      terminalBase = baseKey.split("@")[1];
      // Templates do not partially override objects or merge controls/variables.
      properties = { ...baseProperties, ...value };
    }
    if (properties.controls) {
      properties = { ...properties, controls: properties.controls.map((entry: Record<string, any>) =>
        Object.fromEntries(Object.entries(entry).map(([childKey, child]) => resolve(childKey, child)))) };
    }
    return [terminalBase ? `${name}@${terminalBase}` : name, properties];
  }

  const renderedNames = document.render.controls.map((entry: Record<string, any>) =>
    Object.values(entry)[0].factory.control_ids.hud_actionbar_text.split(`@${namespace}.`)[1]);
  return Object.fromEntries([
    ["namespace", namespace],
    resolve("render", document.render),
    ...renderedNames.map((name: string) => {
      const definition = definitions.get(name);
      if (!definition) throw new Error(`Missing factory target: ${name}`);
      return resolve(definition.key, definition.value);
    })
  ]);
}

export function canonicalUi(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalUi).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalUi(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

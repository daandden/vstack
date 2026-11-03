// `nuxt generate` stamps the shell's payload with the build time. The shell is committed and hashed into host
// compatibility, so the stamp is fixed at 0 and a rebuild of unchanged sources stays byte-identical.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html) => {
    html.bodyAppend = html.bodyAppend.map((chunk) =>
      chunk.replace(/(data-nuxt-data="nuxt-app"[^>]*>)([^<]*)(<\/script>)/, (_, open: string, json: string, close: string) => {
        const payload = JSON.parse(json);
        const at = payload[0]?.prerenderedAt;
        if (typeof at === "number") payload[at] = 0;
        return `${open}${JSON.stringify(payload)}${close}`;
      }));
  });
});

/** The public playground deliberately has no relationship with browser or
 * server libraries. Keep this decision fixed for the lifetime of the page. */
export const isPublicDemo = /^\/demo\/?$/.test(
  globalThis.location?.pathname ?? "",
);

export const DEMO_STATUS = "Temporary demo · resets on reload";

/** Some IMEs report keyCode 229 while finalizing a composition. */
export function isCompositionInput(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

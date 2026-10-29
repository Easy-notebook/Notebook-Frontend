export function validWritingLink(value: string) {
  return (
    /^(https?:\/\/|mailto:|tel:|#|\/|\.\.\/|\.\/)/i.test(value) &&
    !Array.from(value).some((char) => char.charCodeAt(0) <= 32)
  );
}

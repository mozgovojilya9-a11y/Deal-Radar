/** Reads a newline-delimited JSON response line by line as chunks arrive (chunks may split a line). */
export async function readNdjson(response: Response, onLine: (value: unknown) => void): Promise<void> {
  if (!response.body) throw new Error("пустой ответ");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (text: string) => { const line = text.trim(); if (line) onLine(JSON.parse(line)); };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      flush(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  }
  flush(buffer + decoder.decode());
}

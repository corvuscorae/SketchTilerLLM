const projectId = "sketchtiler-dev"; // reuse this to keep the same thread
const log = document.getElementById("log");

function append(who, text) {
  log.textContent += `\n\n${who}: ${typeof text === "string" ? text : JSON.stringify(text, null, 2)}`;
  log.scrollTop = log.scrollHeight;
}

document.getElementById("send").onclick = async () => {
  const text = document.getElementById("text").value.trim();
  if (!text) return;
  append("You", text);
  document.getElementById("text").value = "";

  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, userText: text })
  });
  const data = await r.json();
  append("Assistant", data.text || JSON.stringify(data));
};

document.getElementById("sendImg").onclick = async () => {
  const text = document.getElementById("text").value.trim();
  const file = document.getElementById("img").files[0];
  if (!text && !file) return;
  append("You", text || "[image only]");
  document.getElementById("text").value = "";

  const form = new FormData();
  form.append("projectId", projectId);
  form.append("userText", text || "");
  if (file) form.append("image", file);

  const r = await fetch("/api/chat-with-image", { method: "POST", body: form });
  const data = await r.json();
  append("Assistant", data.text || JSON.stringify(data));
};

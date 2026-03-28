export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const auth = request.headers.get("Authorization");
    if (auth !== "liesbeth") {
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/api/appointments") {

      if (request.method === "GET") {
        const data = await env.AFSPRAKEN_DB.get("appointments");
        return new Response(data || "[]", {
          headers: { "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST") {
        const body = await request.json();
        await env.AFSPRAKEN_DB.put("appointments", JSON.stringify(body));
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not found", { status: 404 });
  }
};

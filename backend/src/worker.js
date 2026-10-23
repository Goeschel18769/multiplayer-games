export default {
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname !== "/health") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (request.method !== "GET") {
      return Response.json(
        { error: "METHOD_NOT_ALLOWED" },
        { status: 405, headers: { Allow: "GET" } },
      );
    }

    return Response.json({ ok: true });
  },
};

// Deprecated stub: database connectivity handled via Supabase admin client in server.js
module.exports = {
  query: async () => {
    throw new Error(
      "Direct Postgres queries are deprecated. Use Supabase admin client (server.js)."
    );
  },
  connect: async () => {
    throw new Error(
      "Direct Postgres connections are deprecated. Use Supabase admin client (server.js)."
    );
  },
  end: async () => {},
};

// src/swagger.ts
import swaggerJSDoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Oureum Backend API",
      version: "1.0.0",
      description:
        "Oureum Admin & User API. Admin endpoints require x-admin-wallet header.",
    },
    servers: [{ url: "http://localhost:4000", description: "Local" }],
    components: {
      securitySchemes: {
        AdminWalletHeader: {
          type: "apiKey",
          in: "header",
          name: "x-admin-wallet",
          description: "Admin MetaMask wallet address (lowercased 0x...).",
        },
      },
      schemas: {
        PriceSnapshot: {
          type: "object",
          properties: {
            id: { type: "integer" },
            source: { type: "string" },
            gold_usd_per_oz: { type: "number", nullable: true },
            fx_usd_to_myr: { type: "number", nullable: true },
            computed_myr_per_g: { type: "number" },
            markup_bps: { type: "integer" },
            note: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: [],
});

export function attachPathsToSpec() {
  (swaggerSpec as any).paths = {
    // ---- Health
    "/healthz": {
      get: { summary: "Health check", tags: ["System"], responses: { 200: { description: "OK" } } },
    },
    "/readyz": {
      get: { summary: "Readiness check", tags: ["System"], responses: { 200: { description: "OK" } } },
    },

    // ---- Price
    "/api/price": {
      get: {
        summary: "Get current price (MYR/g, buy/sell)",
        tags: ["Price"],
        responses: { 200: { description: "Current price" } },
      },
      post: {
        summary: "Manual price override (admin)",
        tags: ["Price"],
        security: [{ AdminWalletHeader: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { myrPerG: { type: "number" }, note: { type: "string" } },
                required: ["myrPerG"],
              },
            },
          },
        },
        responses: { 200: { description: "Snapshot created" } },
      },
    },
    "/api/price/snapshots": {
      get: {
        summary: "List price snapshots",
        tags: ["Price"],
        parameters: [
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { 200: { description: "Snapshots" } },
      },
    },

    // ---- Token Ops
    "/api/token/buy-mint": {
      post: {
        summary: "Buy OUMG and Mint (admin)",
        tags: ["TokenOps"],
        security: [{ AdminWalletHeader: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { wallet: { type: "string" }, grams: { type: "number" } },
                required: ["wallet", "grams"],
              },
            },
          },
        },
        responses: { 200: { description: "Minted" } },
      },
    },
    "/api/token/sell-burn": {
      post: {
        summary: "Sell OUMG and Burn (admin)",
        tags: ["TokenOps"],
        security: [{ AdminWalletHeader: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { wallet: { type: "string" }, grams: { type: "number" } },
                required: ["wallet", "grams"],
              },
            },
          },
        },
        responses: { 200: { description: "Burned" } },
      },
    },
    "/api/token/ops": {
      get: {
        summary: "List token ops (admin)",
        tags: ["TokenOps"],
        security: [{ AdminWalletHeader: [] }],
        parameters: [
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { 200: { description: "List" } },
      },
    },

    // ---- Redemption
    "/api/redemption": {
      post: {
        summary: "Create redemption (user request: CASH or GOLD)",
        tags: ["Redemption"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  wallet: { type: "string" },
                  grams: { type: "number" },
                  type: { type: "string", enum: ["CASH", "GOLD"] },
                },
                required: ["wallet", "grams"],
              },
            },
          },
        },
        responses: { 200: { description: "Created" } },
      },
      get: {
        summary: "List redemptions (admin)",
        tags: ["Redemption"],
        security: [{ AdminWalletHeader: [] }],
        parameters: [
          { in: "query", name: "status", schema: { type: "string" } },
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { 200: { description: "List" } },
      },
    },
    "/api/redemption/{id}": {
      patch: {
        summary: "Update redemption status (admin)",
        tags: ["Redemption"],
        security: [{ AdminWalletHeader: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["APPROVED", "REJECTED", "COMPLETED"] },
                  audit: { type: "object" },
                },
                required: ["status"],
              },
            },
          },
        },
        responses: { 200: { description: "Updated" } },
      },
    },

    // ---- Admin
    "/api/admin/faucet-rm": {
      post: {
        summary: "Credit RM to a wallet (admin faucet)",
        tags: ["Admin"],
        security: [{ AdminWalletHeader: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { wallet: { type: "string" }, amount: { type: "number" } },
                required: ["wallet", "amount"],
              },
            },
          },
        },
        responses: { 200: { description: "Credited" } },
      },
    },
    "/api/admin/balances": {
      get: {
        summary: "Get one user's balances (admin)",
        tags: ["Admin"],
        security: [{ AdminWalletHeader: [] }],
        parameters: [{ in: "query", name: "wallet", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Balances" } },
      },
    },
    "/api/admin/users": {
      get: {
        summary: "List users with balances (admin)",
        tags: ["Admin"],
        security: [{ AdminWalletHeader: [] }],
        parameters: [
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { 200: { description: "List" } },
      },
    },

    // ---- Ledger (admin-only guarded by middleware)
    "/api/ledger/gold": {
      post: {
        summary: "Create gold ledger entry (admin)",
        tags: ["Ledger"],
        security: [{ AdminWalletHeader: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  entry_date: { type: "string", format: "date" },
                  intake_g: { type: "number" },
                  source: { type: "string" },
                  purity_bp: { type: "integer" },
                  serial: { type: "string" },
                  batch: { type: "string" },
                  storage: { type: "string" },
                  custody: { type: "string" },
                  insurance: { type: "string" },
                  audit_ref: { type: "string" },
                  note: { type: "string" },
                },
                required: ["entry_date", "intake_g"],
              },
            },
          },
        },
        responses: { 200: { description: "Created" } },
      },
      get: {
        summary: "List gold ledger entries (admin)",
        tags: ["Ledger"],
        security: [{ AdminWalletHeader: [] }],
        parameters: [
          { in: "query", name: "from", schema: { type: "string", format: "date" } },
          { in: "query", name: "to", schema: { type: "string", format: "date" } },
          { in: "query", name: "source", schema: { type: "string" } },
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { 200: { description: "List" } },
      },
    },

    // ---- User (public)
    "/api/user/balances": {
      get: {
        summary: "Get user balances by wallet (public)",
        tags: ["User"],
        parameters: [{ in: "query", name: "wallet", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Balances" } },
      },
    },
    "/api/user/token-history": {
      get: {
        summary: "Get user token ops history (public)",
        tags: ["User"],
        parameters: [
          { in: "query", name: "wallet", required: true, schema: { type: "string" } },
          { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { 200: { description: "History" } },
      },
    },
    "/api/user/overview": {
      get: {
        summary: "User overview: RM, OUMG, recent ops, redemptions (public)",
        tags: ["User"],
        parameters: [{ in: "query", name: "wallet", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Overview" } },
      },
    },

    // ---- Chain
    "/api/chain/paused": {
      get: { summary: "Read OUMG paused()", tags: ["Chain"], responses: { 200: { description: "OK" } } },
    },
    "/api/chain/pause": {
      post: {
        summary: "Pause OUMG (admin)",
        tags: ["Chain"],
        security: [{ AdminWalletHeader: [] }],
        responses: { 200: { description: "Paused" } },
      },
    },
    "/api/chain/unpause": {
      post: {
        summary: "Unpause OUMG (admin)",
        tags: ["Chain"],
        security: [{ AdminWalletHeader: [] }],
        responses: { 200: { description: "Unpaused" } },
      },
    },
  };
}
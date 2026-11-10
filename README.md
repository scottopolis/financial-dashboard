# Freedom

A private portfolio dashboard and financial freedom planner that runs on your computer and is built to be driven by an agent. Claude reads and changes your holdings and plan through a local MCP connector. The web app shows the same data, and its sliders call the same tools Claude uses.

## Run it

Needs Node.js 22.18 or newer.

```sh
npm install
npm start
```

Open http://localhost:8787. Your data is saved in `data/state.json`. It starts with a sample portfolio until you replace it.

## Connect Claude

Claude starts the connector itself, so the web page doesn't need to be open. The Agent tab in the app shows these commands with the paths on your computer filled in.

**Claude Desktop:** open Settings, then Developer, then Edit Config, and add:

```json
{
  "mcpServers": {
    "freedom": {
      "command": "/path/to/node",
      "args": ["/path/to/financial-dashboard/server/stdio.ts"]
    }
  }
}
```

Then restart Claude Desktop.

**Claude Code:**

```sh
claude mcp add freedom -- "$(which node)" "$PWD/server/stdio.ts"
```

Then ask things like "When can I stop working?", "I bought 25 shares of VOO at $571", or "What if I saved an extra $20k a year?"

## Tools

| Tool | What it does |
| --- | --- |
| `get_overview` | Everything as one Markdown report: holdings, allocation, the freedom plan by stop year, every assumption with its range, distributions, recent changes |
| `get_plan` | The plan by stop year, with optional `whatIf` assumptions that aren't saved |
| `update_plan` | Sets plan assumptions, the same values as the sliders |
| `set_big_purchase`, `remove_big_purchase` | One-time expenses such as a house or college |
| `add_holding`, `update_holding`, `remove_holding` | Stocks, crypto, alternatives, cash |
| `record_distribution` | Payouts from syndications and dividends |
| `refresh_prices` | Fetches current stock, fund, and crypto prices now |

Prices come from Yahoo Finance's public chart endpoint (no API key). They refresh when the server or connector starts if they're older than today, and hourly checks keep them daily while the server runs. `server/prices.ts` is the only file to change to use another source.

The server also offers the connector over HTTP at `/mcp/<secret>` for clients that take a URL. The secret is in `data/mcp-token`. It listens only on `127.0.0.1`.

## Develop

```sh
npm run api   # API and connector on :8787, restarts on change
npm run dev   # web app with hot reload on :5173, proxies /api to :8787
```

The code layout:

- `src/model.ts`: data types, slider definitions, and sample data
- `src/plan.ts`: the Monte Carlo engine
- `server/tools.ts`: every action on the data
- `server/mcp.ts`, `server/stdio.ts`, `server/index.ts`: the connector and the local server

import WebSocket from "ws";
import express from "express";
import http from "http";
import path from "path";
import { request, gql } from "graphql-request";

const app = express();
const server = http.createServer(app);
const wsServer = new WebSocket.Server({
  noServer: true,
});

app.use("/", express.static(path.resolve(__dirname, "../client")));

const wss = new WebSocket.Server({ server });

console.log("Server started on port 3000");

const graphqlEndpoint = "https://graphql.coincap.io/";

interface GraphQLConfig {
  endpoint: string;
  query: string;
  variables: Record<string, any>;
}

async function fetchDataAndBroadcast(
  ws: WebSocket,
  graphqlConfig: GraphQLConfig
) {
  try {
    const data = await request(
      graphqlEndpoint,
      graphqlConfig.query,
      graphqlConfig.variables
    );
    ws.send(JSON.stringify(data)); // Send the fetched data to the WebSocket client
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// Example usage:
const graphqlConfig = (coin: any): GraphQLConfig => ({
  endpoint: "https://graphql.coincap.io/",
  query: gql`
    query GetAssets(
      $direction: SortDirection
      $first: Int
      $sort: AssetSortInput
    ) {
      assets(direction: $direction, first: $first, sort: $sort) {
        pageInfo {
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
        edges {
          cursor
          node {
            changePercent24Hr
            name
            id
            logo
            marketCapUsd
            priceUsd
            rank
            supply
            symbol
            volumeUsd24Hr
            vwapUsd24Hr
          }
        }
      }
    }
  `,
  variables: {
    direction: "ASC",
    first: 200,
    sort: "rank",
  },
});

const graphqlConfigHeader = (coin: any): GraphQLConfig => ({
  endpoint: "https://graphql.coincap.io/",
  query: gql`
    {
      marketTotal {
        marketCapUsd
        exchangeVolumeUsd24Hr
        assets
        exchanges
        markets
        __typename
      }
      asset(id: "${coin}") {
        priceUsd
        marketCapUsd
        volumeUsd24Hr
        __typename
      }
    }
  `,
  variables: {
    direction: "ASC",
    first: 200,
    sort: "rank",
  },
});

wss.on("connection", (ws: WebSocket, request: any) => {
  console.log("New client connected");
  const urlParams = new URLSearchParams(request.url.split("?")[1]);
  const direction: any = urlParams.get("message");
  const coin = urlParams.get("coin");

  fetchDataAndBroadcast(ws, graphqlConfigHeader(coin));
  ws.on("message", (message: WebSocket.Data) => {
    const messageString: any =
      typeof message === "string" ? message : message.toString();

    const coin = messageString.split(",")[1];
    fetchDataAndBroadcast(ws, graphqlConfigHeader(coin));
    if (messageString.split(",")[0] === "list") {
      fetchDataAndBroadcast(ws, graphqlConfig(coin));
      setInterval(() => {
        fetchDataAndBroadcast(ws, graphqlConfig(coin));
        // fetchDataAndBroadcast(ws, graphqlConfigHeader(coin));
      }, 500);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(3000);

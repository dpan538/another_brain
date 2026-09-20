import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/courier-prime/latin-400.css";
import "@fontsource/courier-prime/latin-700.css";
import "@fontsource/courier-prime/latin-400-italic.css";
import "@fontsource/abril-fatface/latin-400.css";
import "@fontsource/yellowtail/latin-400.css";
import "@fontsource/unifrakturmaguntia/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "@fontsource/playfair-display/latin-900-italic.css";
import "@fontsource/rubik-mono-one/latin-400.css";
import "./styles/app.css";
import App from "./App.jsx";
import { loadGlobalFont } from "./ui/fonts.js";

createRoot(document.getElementById("root")).render(<App />);
loadGlobalFont();

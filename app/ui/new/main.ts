// Draw a site: search, outline a polygon, build its layers with the layer service, then
// stack the layers and edit the rules. Svelte 5.
import { mount } from "svelte";
import "maplibre-gl/dist/maplibre-gl.css";
import "../style.css";
import "./new.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });

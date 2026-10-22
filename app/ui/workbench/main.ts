// The workbench (brief section 10.4): a top bar, the steps on the left, the map in the centre,
// the inspector on the right and the pen below. Built from the design system's components
// (ui/system/components.css, docs/ui/system.html). Svelte 5.
import { mount } from "svelte";
import "maplibre-gl/dist/maplibre-gl.css";
import "../system/components.css";
import { applyTokens } from "../tokens";
import Workbench from "./Workbench.svelte";
import "./workbench.css";

applyTokens();
mount(Workbench, { target: document.getElementById("app")! });

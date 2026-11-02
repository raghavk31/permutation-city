// One plot, one building at /build (architecture-v3 section 13, B5). Svelte 5.
import { mount } from "svelte";
import "../system/components.css";
import { applyTokens } from "../tokens";
import "../typologies/typologies.css";
import Build from "./Build.svelte";
import "./build.css";

applyTokens();
mount(Build, { target: document.getElementById("app")! });

// The typology library at /typologies (docs/typologies.md): every precedent drawn from its own
// numbers, with its sources, filterable by programme, climate and mechanism. Svelte 5.
import { mount } from "svelte";
import "../system/components.css";
import { applyTokens } from "../tokens";
import Library from "./Library.svelte";
import "./typologies.css";

applyTokens();
mount(Library, { target: document.getElementById("app")! });

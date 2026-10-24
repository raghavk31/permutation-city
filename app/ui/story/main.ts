// The story page at / (brief 10.13). Links made for the earlier page (a site, a brief or a
// saved run in the query) go on to it at /classic, which still reads them.
import { mount } from "svelte";
import "../system/components.css";
import { applyTokens } from "../tokens";
import Story from "./Story.svelte";
import "./story.css";

if (location.search) location.replace(`${import.meta.env.BASE_URL}classic.html${location.search}${location.hash}`);
else {
  applyTokens();
  mount(Story, { target: document.getElementById("app")! });
}

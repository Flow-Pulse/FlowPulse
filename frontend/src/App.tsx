import { useEffect, useState } from "react";
import { NAV, Shell, type Route } from "./components/Shell";
import { TxDrawer } from "./components/TxDrawer";
import { ReceiptModal } from "./components/ReceiptModal";
import { StreamsPage } from "./pages/Streams";
import { CascadesPage } from "./pages/Cascades";
import { CiCdPage } from "./pages/CiCd";
import { EarningsPage } from "./pages/Earnings";

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (NAV.find((n) => n.id === h)?.id ?? "streams") as Route;
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const label = NAV.find((n) => n.id === route)?.label;
    document.title = `${label} · FlowPulse`;
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <Shell route={route} onRoute={setRoute}>
      {route === "streams" && <StreamsPage />}
      {route === "cascades" && <CascadesPage />}
      {route === "ci" && <CiCdPage />}
      {route === "earnings" && <EarningsPage />}
      <TxDrawer />
      <ReceiptModal />
    </Shell>
  );
}

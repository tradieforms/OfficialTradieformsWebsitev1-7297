import { Route, Switch } from "wouter";
import Index from "./pages/index";
import Shop from "./pages/shop";
import ProductPage from "./pages/product";
import BundleDeals from "./pages/bundle-deals";
import DesignStudio from "./pages/design-studio";
import About from "./pages/about";
import Contact from "./pages/contact";
import Login from "./pages/login";
import Account from "./pages/account";
import CartPage from "./pages/cart";
import CheckoutPage from "./pages/checkout";
import CheckoutSuccessPage from "./pages/checkout-success";
import AdminOrdersPage from "./pages/admin-orders";
import { Layout } from "./components/layout";
import { Provider } from "./components/provider";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { authClient } from "./lib/auth";

// Complete a returning managed (Google / Apple / Microsoft) sign-in before the
// app renders. A no-op on ordinary loads; on an OAuth return leg it exchanges
// the broker JWT for a session so the first paint is already signed in.
await authClient.managedAuth.handleRedirect();

/** Every route except the homepage sits inside the shared header/footer chrome. */
function withLayout(Page: React.ComponentType) {
  return function LaidOut() {
    return (
      <Layout>
        <Page />
      </Layout>
    );
  };
}

const HomeRoute = withLayout(Index);
const ShopRoute = withLayout(Shop);
const ProductRoute = withLayout(ProductPage);
const BundleDealsRoute = withLayout(BundleDeals);
const DesignStudioRoute = withLayout(DesignStudio);
const AboutRoute = withLayout(About);
const ContactRoute = withLayout(Contact);
const LoginRoute = withLayout(Login);
const AccountRoute = withLayout(Account);
const CartRoute = withLayout(CartPage);
const CheckoutRoute = withLayout(CheckoutPage);
const CheckoutSuccessRoute = withLayout(CheckoutSuccessPage);
const AdminOrdersRoute = withLayout(AdminOrdersPage);
const NotFoundRoute = withLayout(NotFound);

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/shop" component={ShopRoute} />
        <Route path="/product/:slug" component={ProductRoute} />
        <Route path="/bundle-deals" component={BundleDealsRoute} />
        <Route path="/design-studio" component={DesignStudioRoute} />
        <Route path="/about" component={AboutRoute} />
        <Route path="/contact" component={ContactRoute} />
        <Route path="/login" component={LoginRoute} />
        <Route path="/account" component={AccountRoute} />
        <Route path="/cart" component={CartRoute} />
        <Route path="/checkout" component={CheckoutRoute} />
        <Route path="/checkout/success" component={CheckoutSuccessRoute} />
        <Route path="/admin/orders" component={AdminOrdersRoute} />
        <Route component={NotFoundRoute} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

function NotFound() {
  return (
    <section className="tf-grit bg-tf-navy py-24 text-white">
      <div className="tf-shell">
        <h1 className="tf-display text-[clamp(2rem,6vw,3.6rem)] text-white">
          That page has left the site.
        </h1>
        <p className="mt-4 max-w-md text-[1rem] text-white/70">
          Try the shop, the bundle deals, or head back to the start.
        </p>
      </div>
    </section>
  );
}

export default App;

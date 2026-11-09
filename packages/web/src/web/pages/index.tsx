import { OrbitalHero } from "../components/orbital-hero";
import { BrandStory } from "../components/home/brand-story";
import { BundleDealsSection } from "../components/home/bundle-deals-section";
import { ClientResults } from "../components/home/client-results";
import { ClosingCta } from "../components/home/closing-cta";
import { CustomisationDemo } from "../components/home/customisation-demo";
import { FeaturedWorkwear } from "../components/home/featured-workwear";

export default function HomePage() {
  return (
    <>
      <OrbitalHero />
      <FeaturedWorkwear />
      <CustomisationDemo />
      <BundleDealsSection />
      <BrandStory />
      <ClientResults />
      <ClosingCta />
    </>
  );
}

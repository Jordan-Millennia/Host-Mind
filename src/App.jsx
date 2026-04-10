import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import LogoBar from './components/LogoBar.jsx'
import Features from './components/Features.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import UseCases from './components/UseCases.jsx'
import Testimonials from './components/Testimonials.jsx'
import Pricing from './components/Pricing.jsx'
import Waitlist from './components/Waitlist.jsx'
import CTA from './components/CTA.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white">
      <Navbar />
      <main>
        <Hero />
        <LogoBar />
        <Features />
        <HowItWorks />
        <UseCases />
        <Testimonials />
        <Pricing />
        <Waitlist />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}

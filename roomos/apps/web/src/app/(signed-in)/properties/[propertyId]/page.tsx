import { notFound } from "next/navigation"
import { requireSignedIn } from "@/lib/auth"
import { getPropertyDetail } from "@/lib/property-queries"
import { PropertyHero } from "@/components/properties/PropertyHero"
import { PropertyKpiStrip } from "@/components/properties/PropertyKpiStrip"
import { BedroomGrid } from "@/components/properties/BedroomGrid"
import { PropertyDetailRail } from "@/components/properties/PropertyDetailRail"

export default async function PropertyDetailPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { orgId } = await requireSignedIn()
  const { propertyId } = await params
  const p = await getPropertyDetail(orgId, propertyId)
  if (!p) notFound()

  return (
    <div className="max-w-[1440px] mx-auto px-10 pt-9 pb-20">
      <PropertyHero p={p} />
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-14 mt-9">
        <div>
          <PropertyKpiStrip p={p} />
          <div className="flex items-baseline justify-between mb-5">
            <div className="font-[family-name:var(--font-display)] text-[26px]">Bedrooms</div>
            <div className="text-xs text-[color:var(--color-ink-3)]">
              <strong className="text-[color:var(--color-ink-2)] font-medium">{p.totalRooms}</strong> bedrooms · <strong className="text-[color:var(--color-ink-2)] font-medium">{p.occupiedCount}</strong> occupied
            </div>
          </div>
          <BedroomGrid rooms={p.rooms} />
        </div>
        <PropertyDetailRail p={p} />
      </div>
    </div>
  )
}

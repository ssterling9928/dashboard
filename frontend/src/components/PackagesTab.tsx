
import type { Package } from '@shared/types'
import PackageCard from './PackageCard'

interface Props {
  packages: Package[]
  onSelectPackage: (id: string) => void
}

export default function PackagesTab({ packages, onSelectPackage }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {packages.map((pkg) => (
        <PackageCard
          key={pkg.id}
          pkg={pkg}
          onDetails={() => onSelectPackage(pkg.id)}
        />
      ))}
    </div>
  )
}
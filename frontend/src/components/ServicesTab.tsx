
import type { Service } from '@shared/types'
import ServiceCard from './ServiceCard'

interface Props {
  services: Service[]
  onSelectService: (id: string) => void
}

export default function ServicesTab({ services, onSelectService }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onDetails={() => onSelectService(service.id)}
        />
      ))}
    </div>
  )
}
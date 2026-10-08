// A simple, reusable Card component.
// Pass title, description, and optionally children for custom content.
interface CardProps {
  title: string;
  description: string;
  children?: React.ReactNode;
}

export default function Card({ title, description, children }: CardProps) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-500 text-sm">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

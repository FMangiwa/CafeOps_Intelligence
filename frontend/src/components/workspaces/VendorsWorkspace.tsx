"use client";

export type VendorsWorkspaceProps = {
  locationId: string | null;
};

export default function VendorsWorkspace({ locationId }: VendorsWorkspaceProps) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vendor, purchasing, and invoice operations for the selected location.
        </p>
      </header>

      <section className="rounded-xl border bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-700">
            ♧
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Vendor workspace</h2>
            <p className="mt-1 text-sm text-gray-600">
              Location: {locationId ?? "No location selected"}
            </p>
            <p className="mt-3 text-sm text-gray-500">
              Vendor, purchase-order, and invoice data exists in the operational
              dataset, but the current backend exposes no vendor report endpoint.
              This workspace is intentionally kept free of fabricated metrics until
              the vendor reporting API is implemented.
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}

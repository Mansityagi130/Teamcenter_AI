export function ActivityLog({ data }: { data: any }) {
  const tokenLogs = data?.token_logs || [];
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold">Activity Log</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2">Time</th>
              <th className="py-2">Model</th>
              <th className="py-2">Input</th>
              <th className="py-2">Output</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {tokenLogs.map((row: any, index: number) => (
              <tr key={index} className="border-b last:border-0">
                <td className="py-2">{new Date(row.created_at).toLocaleString()}</td>
                <td className="py-2">{row.model}</td>
                <td className="py-2">{row.input_tokens}</td>
                <td className="py-2">{row.output_tokens}</td>
                <td className="py-2 font-medium">{row.total_tokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

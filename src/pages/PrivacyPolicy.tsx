export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
        <h1 className="text-3xl font-bold mb-2">SpeedVendors – Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: 3 December 2025</p>
        
        <p className="mb-6">
          This Privacy Policy explains how SpeedVendors ("we", "our", or "the app") collects, uses, and protects your information when you use our mobile application.
        </p>
        <p className="mb-8">
          By using SpeedVendors, you agree to the terms described in this Privacy Policy.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
        
        <h3 className="text-xl font-medium mt-6 mb-3">1.1 Information You Provide</h3>
        <p className="mb-2">When creating and managing your store, we may collect:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Name and contact information</li>
          <li>Email address</li>
          <li>Store details</li>
          <li>Product information</li>
          <li>Order and customer information you upload or manage</li>
          <li>Payment setup information (Netopia account details are handled securely through their platform)</li>
        </ul>

        <h3 className="text-xl font-medium mt-6 mb-3">1.2 Automatically Collected Information</h3>
        <p className="mb-2">When using the app, we may collect:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Device information (model, OS version, language)</li>
          <li>App usage statistics</li>
          <li>Crash logs and performance data</li>
          <li>IP address (for security and analytics)</li>
        </ul>

        <h3 className="text-xl font-medium mt-6 mb-3">1.3 Third-Party Integrations</h3>
        <p className="mb-2">SpeedVendors integrates with:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Netopia for payment processing</li>
          <li>Oblio.eu for invoicing</li>
          <li>eAWB for delivery and airway bill generation</li>
        </ul>
        <p className="mb-4">These services may collect additional information based on their own privacy policies.</p>
        <p className="mb-4 font-medium">We do not store or access your full payment details on our servers.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">2. How We Use Your Information</h2>
        <p className="mb-2">We use your information to:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Create and manage your SpeedVendors account</li>
          <li>Operate your ecommerce store</li>
          <li>Process payments (through Netopia)</li>
          <li>Generate invoices (through Oblio.eu)</li>
          <li>Generate airway bills (through eAWB)</li>
          <li>Provide customer support</li>
          <li>Improve app performance and user experience</li>
          <li>Ensure platform security and fraud prevention</li>
        </ul>
        <p className="mb-4 font-medium">We do not sell or share your personal data with third parties for marketing purposes.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">3. Data Storage and Security</h2>
        <p className="mb-4">
          We take reasonable technical and organizational measures to protect your data. Your data may be stored securely using third-party services such as Supabase or other encrypted storage providers.
        </p>
        <p className="mb-4">
          No method of data transmission or storage is 100% secure, but we work to maintain the highest protection standards.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">4. How We Share Information</h2>
        <p className="mb-2">We may share data only in the following cases:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li><strong>Payment Processing:</strong> Shared with Netopia</li>
          <li><strong>Invoicing:</strong> Shared with Oblio.eu</li>
          <li><strong>Delivery Management:</strong> Shared with eAWB</li>
          <li><strong>Legal Compliance:</strong> If required by law or government authorities</li>
          <li><strong>Service Providers:</strong> Only when necessary to operate the app (e.g., hosting, analytics)</li>
        </ul>
        <p className="mb-4 font-medium">We do not share your information with advertisers.</p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">5. Your Rights</h2>
        <p className="mb-2">Depending on your location, you may have the right to:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Access your data</li>
          <li>Update or correct your information</li>
          <li>Delete your account</li>
          <li>Request deletion of your stored data</li>
          <li>Object to certain types of data processing</li>
        </ul>
        <p className="mb-4">
          To request any of these actions, contact us at: <a href="mailto:cosminharbon@icloud.com" className="text-primary hover:underline">cosminharbon@icloud.com</a>
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">6. Data Retention</h2>
        <p className="mb-2">We keep your data only as long as necessary to:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Maintain your account</li>
          <li>Provide services</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p className="mb-4">
          You may delete your account at any time, and we will remove or anonymize your data unless legally required to keep it.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">7. Children's Privacy</h2>
        <p className="mb-4">
          SpeedVendors is not intended for children under 16. We do not knowingly collect personal information from children.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">8. Changes to This Privacy Policy</h2>
        <p className="mb-4">
          We may update this Privacy Policy from time to time. Any changes will be posted within the app, and the "Last updated" date will be modified.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">9. Contact Us</h2>
        <p className="mb-4">
          If you have questions about this Privacy Policy, contact us at: <a href="mailto:cosminharbon@icloud.com" className="text-primary hover:underline">cosminharbon@icloud.com</a>
        </p>
      </div>
    </div>
  );
}

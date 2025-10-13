import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const CreateTestOrderButton = () => {
  const [creating, setCreating] = useState(false);

  const handleCreateTestOrder = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-test-order');

      if (error) throw error;

      if (data.success) {
        toast.success('Test order created successfully for BARRY WHITE');
        // Refresh the page to show the new order
        window.location.reload();
      } else {
        throw new Error(data.error || 'Failed to create test order');
      }
    } catch (error: any) {
      console.error('Error creating test order:', error);
      toast.error(error.message || 'Failed to create test order');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Button 
      onClick={handleCreateTestOrder} 
      disabled={creating}
      variant="outline"
    >
      {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Create Test Order (BARRY WHITE)
    </Button>
  );
};

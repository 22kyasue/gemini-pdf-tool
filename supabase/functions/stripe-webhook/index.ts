// Supabase Edge Function: stripe-webhook
// Handles Stripe subscription events and syncs plan status to Supabase.
// Deploy: supabase functions deploy stripe-webhook
// Set in Stripe Dashboard: webhook endpoint = https://<project>.supabase.co/functions/v1/stripe-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  // ── Verify Stripe signature ───────────────────────────────
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return json({ error: 'Missing stripe-signature header' }, 400);
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return json({ error: `Signature verification failed: ${err}` }, 400);
  }

  // ── Supabase client (service role for writes) ─────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Handle events ─────────────────────────────────────────
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (profile?.id) {
        await supabase
          .from('profiles')
          .update({
            plan: 'pro',
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', profile.id);

        if (session.subscription) {
          await supabase.from('subscriptions').upsert({
            id: session.subscription as string,
            user_id: profile.id,
            status: 'active',
            updated_at: new Date().toISOString(),
          });
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (profile?.id) {
        await supabase.from('subscriptions').upsert({
          id: subscription.id,
          user_id: profile.id,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Keep plan in sync with subscription status
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          await supabase.from('profiles').update({ plan: 'pro' }).eq('id', profile.id);
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          await supabase.from('profiles').update({ plan: 'free' }).eq('id', profile.id);
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (profile?.id) {
        // Downgrade to free and reset usage counters
        await supabase
          .from('profiles')
          .update({ plan: 'free', api_calls_used: 0, words_used: 0 })
          .eq('id', profile.id);

        await supabase.from('subscriptions').upsert({
          id: subscription.id,
          user_id: profile.id,
          status: 'canceled',
          updated_at: new Date().toISOString(),
        });
      }
      break;
    }

    default:
      // Unhandled event types are fine — just acknowledge
      break;
  }

  return json({ received: true });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

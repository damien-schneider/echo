use anyhow::Result;
use std::future::Future;
use std::ops::Deref;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use tokio::sync::{watch, RwLock, RwLockReadGuard, RwLockWriteGuard};

/// Users share the runtime, a swap or repair waits them out, and quitting never waits on either.
pub(super) struct RuntimeSlot<R> {
    current: Mutex<Arc<R>>,
    gate: RwLock<()>,
    closed: watch::Sender<bool>,
}

pub(crate) struct RuntimeLease<'a, R> {
    _gate: RwLockReadGuard<'a, ()>,
    runtime: Arc<R>,
}

pub(super) struct RuntimeSwap<'a, R> {
    slot: &'a RuntimeSlot<R>,
    _gate: RwLockWriteGuard<'a, ()>,
    runtime: Arc<R>,
}

impl<R> Deref for RuntimeLease<'_, R> {
    type Target = R;

    fn deref(&self) -> &R {
        &self.runtime
    }
}

impl<R> Deref for RuntimeSwap<'_, R> {
    type Target = R;

    fn deref(&self) -> &R {
        &self.runtime
    }
}

fn closed_error() -> anyhow::Error {
    anyhow::anyhow!("Echo is shutting down")
}

impl<R> RuntimeSlot<R> {
    pub(super) fn new(runtime: R) -> Self {
        Self {
            current: Mutex::new(Arc::new(runtime)),
            gate: RwLock::new(()),
            closed: watch::channel(false).0,
        }
    }

    fn current(&self) -> MutexGuard<'_, Arc<R>> {
        self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn is_closed(&self) -> bool {
        *self.closed.borrow()
    }

    /// Hands back the runtime to stop without taking the gate, so a long answer cannot hold up quitting.
    pub(super) fn close(&self) -> Arc<R> {
        self.closed.send_replace(true);
        self.current().clone()
    }

    pub(super) async fn lease(&self) -> RuntimeLease<'_, R> {
        let gate = self.gate.read().await;
        RuntimeLease {
            _gate: gate,
            runtime: self.current().clone(),
        }
    }

    pub(super) fn try_lease(&self) -> Option<RuntimeLease<'_, R>> {
        let gate = self.gate.try_read().ok()?;
        Some(RuntimeLease {
            _gate: gate,
            runtime: self.current().clone(),
        })
    }

    pub(super) async fn exclusive(&self) -> Result<RuntimeSwap<'_, R>> {
        let gate = self.gate.write().await;
        if self.is_closed() {
            return Err(closed_error());
        }
        Ok(RuntimeSwap {
            slot: self,
            _gate: gate,
            runtime: self.current().clone(),
        })
    }
}

impl<R> RuntimeSwap<'_, R> {
    pub(super) async fn unless_closed<T>(
        &self,
        work: impl Future<Output = Result<T>>,
    ) -> Result<T> {
        let mut closed = self.slot.closed.subscribe();
        tokio::select! {
            biased;
            _ = closed.wait_for(|closed| *closed) => Err(closed_error()),
            result = work => result,
        }
    }

    /// Refused once quitting began: the runtime being stopped must stay the one in the slot.
    pub(super) fn replace(self, runtime: R) -> Result<()> {
        let mut current = self.slot.current();
        if self.slot.is_closed() {
            return Err(closed_error());
        }
        *current = Arc::new(runtime);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::RuntimeSlot;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn quitting_reaches_the_runtime_while_an_answer_holds_it_and_a_swap_waits() {
        let slot = Arc::new(RuntimeSlot::new("qwen"));
        let lease = slot.lease().await;
        let waiting_swap = tokio::spawn({
            let slot = slot.clone();
            async move { slot.exclusive().await.map(drop) }
        });
        tokio::time::sleep(Duration::from_millis(10)).await;

        assert_eq!(*slot.close(), "qwen");

        drop(lease);
        let swap = waiting_swap.await.expect("the swap task finishes");
        assert_eq!(swap.unwrap_err().to_string(), "Echo is shutting down");
    }

    #[tokio::test]
    async fn a_runtime_loaded_during_quitting_never_replaces_the_one_being_stopped() {
        let slot = RuntimeSlot::new("qwen");
        let swap = slot.exclusive().await.expect("the slot is open");

        let stopped = slot.close();
        let replaced = swap.replace("gemma");

        assert_eq!(replaced.unwrap_err().to_string(), "Echo is shutting down");
        assert_eq!(*stopped, "qwen");
        assert_eq!(*slot.close(), "qwen");
    }

    #[tokio::test]
    async fn quitting_abandons_a_load_in_progress() {
        let slot = RuntimeSlot::new("qwen");
        let swap = slot.exclusive().await.expect("the slot is open");

        let load = swap.unless_closed(async {
            slot.close();
            std::future::pending::<anyhow::Result<()>>().await
        });

        assert_eq!(load.await.unwrap_err().to_string(), "Echo is shutting down");
    }
}

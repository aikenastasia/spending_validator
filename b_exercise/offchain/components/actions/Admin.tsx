import { useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/modal";

import { Action } from "@/types/action";

export default function Admin(props: { onLock: Action; onUnlock: Action }) {
  const { onLock, onUnlock } = props;

  function LockButton() {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    const [lovelace, setLovelace] = useState(0n);
    const [beneficiaryAddress, setBeneficiaryAddress] = useState(""); // addr_...

    return (
      <>
        <Button className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full" onPress={onOpen}>
          Lock
        </Button>

        <Modal isOpen={isOpen} placement="top-center" onOpenChange={onOpenChange}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">Lock</ModalHeader>
                <ModalBody>
                  <Input
                    label="Quantity"
                    placeholder="0.000000"
                    startContent={
                      <div className="pointer-events-none flex items-center">
                        <span className="text-default-400 text-small">ADA</span>
                      </div>
                    }
                    type="number"
                    variant="bordered"
                    onValueChange={(value: string) => setLovelace(BigInt(parseFloat(value) * 1_000000))}
                  />
                  <Input label="Beneficiary" placeholder="addr_..." variant="bordered" onValueChange={setBeneficiaryAddress} />
                </ModalBody>
                <ModalFooter>
                  <Button
                    className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                    radius="full"
                    onPress={() => onLock({ lovelace, beneficiaryAddress }).then(onClose)}
                  >
                    Submit
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </>
    );
  }

  function UnlockButton() {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    const [senderAddress, setSenderAddress] = useState(""); // addr_...

    return (
      <>
        <Button className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full" onPress={onOpen}>
          Unlock
        </Button>

        <Modal isOpen={isOpen} placement="top-center" onOpenChange={onOpenChange}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">Unlock</ModalHeader>
                <ModalBody>
                  <Input label="Sender Address" placeholder="addr_..." variant="bordered" onValueChange={setSenderAddress} />
                </ModalBody>
                <ModalFooter>
                  <Button
                    className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                    radius="full"
                    onPress={() => onUnlock(senderAddress).then(onClose)}
                  >
                    Submit
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      <LockButton />
      <UnlockButton />
    </div>
  );
}

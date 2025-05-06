import { useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/modal";

import { Action } from "@/types/action";

export default function BasicTransfer(props: { onTransfer: Action }) {
  const { onTransfer } = props;

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const [address, setAddress] = useState("");
  const [lovelace, setLovelace] = useState(0n);

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      <Button className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full" onPress={onOpen}>
        Transfer
      </Button>

      <Modal isOpen={isOpen} placement="top-center" onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Transfer</ModalHeader>
              <ModalBody>
                <Input label="Address" placeholder=" " variant="bordered" onValueChange={setAddress} />
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
              </ModalBody>
              <ModalFooter>
                <Button
                  className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                  radius="full"
                  onPress={() => onTransfer({ toAddress: address, lovelace }).then(onClose)}
                >
                  Submit
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
